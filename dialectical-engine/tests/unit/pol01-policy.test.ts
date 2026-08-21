import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createContractClient } from "@debateai/contract";
import { ContractHttpError } from "@debateai/contract";
import { readDeploymentRiskTier } from "@debateai/register";
import { createDebate } from "../../apps/ui/lib/api.js";
import {
  classifyTokenUnlockFailure,
  shouldClearStoredTokenAfterUnlockFailure
} from "../../apps/ui/lib/v3/tokenUnlock.js";

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
      decision_owner: "asker:test",
      action_owner: "asker:test",
      decision_scope: "POL-01 UI disclosure",
      as_of: "2026-08-12T08:00:00.000Z"
    }, "test-token", client)).rejects.toThrow(
      "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: No healthy provider remained at claim"
    );
  });

  it("clears a stored token only after an observed rejection, never after an outage", () => {
    expect(shouldClearStoredTokenAfterUnlockFailure(
      new ContractHttpError("SESSION_REQUIRED", 401, "denied")
    )).toBe(true);
    expect(shouldClearStoredTokenAfterUnlockFailure(
      new ContractHttpError("FORBIDDEN", 403, "denied")
    )).toBe(true);
    expect(shouldClearStoredTokenAfterUnlockFailure(
      new ContractHttpError("NETWORK_FAILURE", 0, "ECONNREFUSED")
    )).toBe(false);
    expect(shouldClearStoredTokenAfterUnlockFailure(
      new ContractHttpError("SERVER_FAILURE", 500, "coordinator failed")
    )).toBe(false);
    expect(classifyTokenUnlockFailure(
      new ContractHttpError("SERVER_FAILURE", 502, "API unreachable", "API_UPSTREAM_UNREACHABLE")
    )).toMatchObject({ kind: "UNREACHABLE" });
  });

  it("routes both automatic stored-token checks through the typed failure decision", async () => {
    const [authGate, debatePage, debateTree, nodeDrawer] = await Promise.all([
      readFile(new URL("../../apps/ui/components/AuthGate.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/app/debate/[id]/DebatePageClient.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/components/DebateTree.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../apps/ui/components/NodeDetailDrawer.tsx", import.meta.url), "utf8")
    ]);
    expect(authGate.match(/if \(shouldClearStoredTokenAfterUnlockFailure\(error\)\) clearStoredToken\(\)/g)).toHaveLength(2);
    expect(authGate).not.toContain("Saved token is no longer valid.");
    expect(debatePage.match(/if \(shouldClearStoredTokenAfterUnlockFailure\(error\)\) clearStoredToken\(\)/g)).toHaveLength(2);
    expect(debatePage).not.toContain("looksAuthRelated");
    expect(debateTree).not.toContain("looksAuthRelated");
    expect(nodeDrawer).not.toContain("looksAuthRelated");
  });
});
