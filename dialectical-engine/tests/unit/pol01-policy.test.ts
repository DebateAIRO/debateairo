import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createContractClient } from "@debateai/contract";
import { ContractHttpError } from "@debateai/contract";
import { readDeploymentRiskTier } from "@debateai/register";
import { createDebate } from "../../apps/ui/lib/api.js";
import { classifyTokenUnlockFailure } from "../../apps/ui/lib/v3/tokenUnlock.js";

function poolReturning(rows: readonly Record<string, unknown>[]): Pool {
  return { query: async () => ({ rows }) } as unknown as Pool;
}

describe("POL-01 register-owned deployment floor", () => {
  it("reads one valid riskTier row with provenance", async () => {
    await expect(readDeploymentRiskTier(poolReturning([{
      row_key: "riskTier", value_json: "standard", source_ref: "register:test:risk"
    }]), 7)).resolves.toEqual({
      rowKey: "riskTier",
      registerVersion: 7,
      sourceRef: "register:test:risk",
      value: "standard"
    });
  });

  it.each([
    ["absent", []],
    ["NULL", [{ row_key: "riskTier", value_json: null, source_ref: "register:test:risk" }]],
    ["invalid", [{ row_key: "riskTier", value_json: "extreme", source_ref: "register:test:risk" }]]
  ] as const)("refuses a %s deployment riskTier instead of consulting an env fallback", async (_case, rows) => {
    await expect(readDeploymentRiskTier(poolReturning(rows), 7)).rejects.toMatchObject({
      name: "TypedDomainError"
    });
  });

  it("composes apps/api/main from the same register row rather than DEPLOYMENT_RISK_TIER", async () => {
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(source).toContain("readDeploymentRiskTier");
    expect(source).toContain("deploymentRiskTier.value");
    expect(source).not.toContain("environment.DEPLOYMENT_RISK_TIER");
  });

  it("surfaces the typed refusal code and reason through the /new form data path", async () => {
    const client = createContractClient("http://api.test", (async () => new Response(JSON.stringify({
      error: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
      message: "No healthy provider remained at claim"
    }), { status: 422, headers: { "content-type": "application/json" } })) as typeof fetch);

    await expect(createDebate("What follows from this evidence?", {
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      composition_budget_tier: "low",
      depth: 3,
      decision_scope: "POL-01 UI disclosure",
      as_of: "2026-08-12T08:00:00.000Z"
    }, "test-token", client)).rejects.toThrow(
      "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim"
    );
  });

  it("distinguishes a rejected cookie session from an outage", () => {
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("SESSION_REQUIRED", 401, "denied")
    ).kind).toBe("REJECTED");
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("FORBIDDEN", 403, "denied")
    ).kind).toBe("REJECTED");
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("NETWORK_FAILURE", 0, "ECONNREFUSED")
    ).kind).toBe("UNREACHABLE");
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("SERVER_FAILURE", 500, "coordinator failed")
    ).kind).toBe("COORDINATOR_FAILED");
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("SERVER_FAILURE", 502, "API unreachable", "API_UPSTREAM_UNREACHABLE")
    )).toMatchObject({ kind: "UNREACHABLE" });
  });

  it("uses cookie-session validation without browser storage or manual credential gates", async () => {
    const [authGate, debatePage, uiApi, webApi, debateTree, nodeDrawer] = await Promise.all([
      readFile(new URL("../../apps/ui/components/AuthGate.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/app/debate/[id]/DebatePageClient.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../web/lib/api.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/components/DebateTree.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/components/NodeDetailDrawer.tsx", import.meta.url), "utf8")
    ]);
    expect(authGate).toContain("validateSession()");
    expect(authGate).not.toContain("Saved token is no longer valid.");
    expect(debatePage).toContain("COOKIE_SESSION_MARKER");
    for (const source of [authGate, debatePage, uiApi, webApi]) {
      expect(source).not.toMatch(/getStoredToken|setStoredToken|clearStoredToken|localStorage/);
    }
    expect(debatePage).not.toContain("looksAuthRelated");
    expect(debateTree).not.toContain("looksAuthRelated");
    expect(nodeDrawer).not.toContain("looksAuthRelated");
  });
});
